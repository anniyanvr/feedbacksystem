package de.thm.ii.fbs.model.classroom

import java.security.Principal

import de.thm.ii.fbs.model.User
import de.thm.ii.fbs.model.classroom.storage.NonDuplicatesBidirectionalStorage

import scala.collection.mutable

/**
  * Maps invitations to principals.
  */
object UserConferenceMap extends NonDuplicatesBidirectionalStorage[Invitation, Principal] {
  /**
    * Maps a user to its session
    *
    * @param invitation invitation
    * @param p          principal
    */
  def map(invitation: Invitation, p: Principal): Unit = {
    super.put(invitation, p)
    onMapListeners.foreach(_ (invitation, p))
  }

  /**
    * @param invitation invitation details
    * @return The principal for the given session id
    */
  def get(invitation: Invitation): Option[Principal] = super.getSingleB(invitation)

  /**
    * @param p The principal
    * @return The invitation for the given principal
    */
  def get(p: Principal): Option[Invitation] = super.getSingleA(p)

  /**
    * Removes both, the user and its invitation by using its invitation
    *
    * @param invitation Session id
    */
  def delete(invitation: Invitation): Unit = {
    super.deleteByA(invitation).foreach(p => {
      onDeleteListeners.foreach(_ (invitation, p))
    })
  }

  /**
    * Lets a user attend a conference of another user
    *
    * @param invitation invitation of the conference the user want to attend
    * @param principal  user that wants to attend
    */
  def attend(invitation: Invitation, principal: Principal): Unit = {
    super.getSingleB(invitation) match {
      case Some(p) => super.getSingleA(p) match {
        case Some(v) => v.attendees += principal.getName;
        case None =>
      }
      case None =>
    }
    onAttendListeners.foreach(_ (invitation, principal))
  }

  /**
    * Lets a user depart from a conference of another user
    * Removes both, the user and its invitation by using its invitation
    *
    * @param invitation invitation of the conference the user want to depart from
    * @param principal  user that wants to depart
    */
  def depart(invitation: Invitation, principal: Principal): Unit = {
    super.getSingleA(invitation.creator) match {
      case Some(v) =>
        v.attendees -= principal.getName
        onDepartListeners.foreach(_ (invitation, principal))
      case None =>
    }
  }

  /**
    * Lets a user depart from a conference if he attends any
    *
    * @param principal user that departs from conferences
    */
  def departAll(principal: Principal): Unit = {
    super.getAllA.foreach((invitation) => {
      if (invitation.attendees.contains(principal.getName)) {
        this.depart(invitation, principal);
      }
    })
  }

  /**
    * Removes both, the user and its session by using its principal
    *
    * @param p The principal
    */
  def delete(p: Principal): Unit = {
    this.deleteByB(p).foreach(invitation => {
      onDeleteListeners.foreach(_ (invitation, p))
    })
  }

  private val onMapListeners = mutable.Set[(Invitation, Principal) => Unit]()
  private val onDeleteListeners = mutable.Set[(Invitation, Principal) => Unit]()
  private val onAttendListeners = mutable.Set[(Invitation, Principal) => Unit]()
  private val onDepartListeners = mutable.Set[(Invitation, Principal) => Unit]()

  /**
    * @param cb Callback that gets executed on every map event
    */
  def onMap(cb: (Invitation, Principal) => Unit): Unit = {
    onMapListeners.add(cb)
  }

  /**
    * @param cb Callback that gets executed on every attend event
    */
  def onAttend(cb: (Invitation, Principal) => Unit): Unit = {
    onAttendListeners.add(cb)
  }

  /**
    * @param cb Callback that gets executed on every depart event
    */
  def onDepart(cb: (Invitation, Principal) => Unit): Unit = {
    onDepartListeners.add(cb)
  }

  /**
    * @param cb Callback that gets executed on every map event
    */
  def onDelete(cb: (Invitation, Principal) => Unit): Unit = {
    onDeleteListeners.add(cb)
  }

  /**
    * @param user User to check for open Conference for
    * @return boolean state of user existence in this map
    */
  def exists(user: User): Boolean = {
    this.getAllB.exists(p => p.getName == user.username)
  }

  /**
    * Get all user that currently in a course.
    *
    * @param courseId The course id
    * @return The Invitations in the course
    */
  def getInvitations(courseId: Int): List[Invitation] = this.getAllA.filter(inv => inv.courseId == courseId).toList
}
